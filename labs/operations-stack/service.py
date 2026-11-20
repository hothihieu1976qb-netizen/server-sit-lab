import json
import os
import re
import sqlite3
import sys
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore, Lock, Thread
from time import perf_counter, sleep
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, build_opener
from uuid import uuid4

ROLE = os.getenv('SIT_ROLE', 'gateway')
RELEASE = os.getenv('SIT_RELEASE', 'v1')
PORT = int(os.getenv('SIT_PORT', '8080'))
DATA = Path(os.getenv('SIT_DATA', '/data/orders.db'))
LEDGER = os.getenv('SIT_LEDGER', 'http://ledger:8080')
WORKERS = int(os.getenv('SIT_WORKERS', '2'))
WORK_MS = int(os.getenv('SIT_WORK_MS', '80'))
SLOTS = BoundedSemaphore(WORKERS)
REQUESTS = Counter()
METRICS_LOCK = Lock()
DEPENDENCY_READY = None
HTTP = build_opener(ProxyHandler({}))
INSTANCE = uuid4().hex[:12]


def open_orders():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DATA, timeout=3)


def prepare_orders():
    with open_orders() as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS orders (reference TEXT PRIMARY KEY)')
        connection.executemany('INSERT OR IGNORE INTO orders VALUES (?)', [('SIT-1001',), ('SIT-1002',)])


def upstream(endpoint, timeout=2):
    try:
        with HTTP.open(f'{LEDGER}/{RELEASE}/{endpoint}', timeout=timeout) as response:
            return json.load(response), None
    except HTTPError as error:
        error.close()
        return None, f'ledger_http_{error.code}'
    except (OSError, ValueError):
        return None, 'ledger_unreachable'


def sample_dependency():
    global DEPENDENCY_READY
    while True:
        _, error = upstream('ready', timeout=0.75)
        with METRICS_LOCK:
            DEPENDENCY_READY = int(not error)
        sleep(0.5)


class Server(ThreadingHTTPServer):
    request_queue_size = 48


class Handler(BaseHTTPRequestHandler):
    def reply(self, code, body, content_type='application/json'):
        data = (json.dumps(body) if isinstance(body, dict) else body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/live':
            return self.reply(200, {'role': ROLE, 'release': RELEASE})
        if ROLE == 'ledger':
            if path == '/v1/ready':
                return self.reply(200, {'ready': True})
            if path != '/v1/orders':
                return self.reply(404, {'error': 'ledger_contract_not_found'})
            queued_at = perf_counter()
            with SLOTS:
                queue_ms = round((perf_counter() - queued_at) * 1000, 2)
                sleep(WORK_MS / 1000)
                with open_orders() as connection:
                    orders = [row[0] for row in connection.execute('SELECT reference FROM orders ORDER BY reference')]
            return self.reply(200, {'orders': orders, 'queueMs': queue_ms, 'workers': WORKERS, 'workMs': WORK_MS, 'ledgerInstance': INSTANCE})
        if path == '/ready':
            _, error = upstream('ready')
            return self.reply(503 if error else 200, {'ready': not error, 'release': RELEASE, 'dependency': error})
        if path == '/metrics':
            with METRICS_LOCK:
                counters = list(REQUESTS.items())
                ready = DEPENDENCY_READY
            metrics = ['# TYPE sit_gateway_dependency_ready gauge']
            if ready is not None:
                metrics.append(f'sit_gateway_dependency_ready {ready}')
            metrics.append('# TYPE sit_gateway_orders_total counter')
            metrics.extend(f'sit_gateway_orders_total{{status="{code}"}} {total}' for code, total in counters)
            return self.reply(200, '\n'.join(metrics) + '\n', 'text/plain; version=0.0.4; charset=utf-8')
        if path == '/orders':
            response, error = upstream('orders')
            code = 502 if error else 200
            with METRICS_LOCK:
                REQUESTS[code] += 1
            if error:
                print(f'release={RELEASE} upstream={LEDGER}/{RELEASE}/orders result={error}', flush=True)
            return self.reply(code, {'error': error, 'release': RELEASE} if error else {**response, 'release': RELEASE})
        return self.reply(404, {'error': 'not_found'})


if __name__ == '__main__':
    if ROLE == 'ledger':
        prepare_orders()
        if len(sys.argv) == 3 and sys.argv[1] == 'add' and re.fullmatch(r'SIT-[A-Z0-9-]{1,24}', sys.argv[2]):
            with open_orders() as connection:
                connection.execute('INSERT OR IGNORE INTO orders VALUES (?)', (sys.argv[2],))
            print(f'{sys.argv[2]} present in {DATA}')
            sys.exit(0)
    if len(sys.argv) != 1:
        sys.exit('Usage: service.py [add SIT-REFERENCE only in ledger]')
    if ROLE == 'gateway':
        Thread(target=sample_dependency, daemon=True).start()
    port_bind = os.getenv('SIT_BIND', '0.0.0.0')
    print(f'role={ROLE} release={RELEASE} listening={port_bind}:{PORT}', flush=True)
    with Server((port_bind, PORT), Handler) as server:
        server.serve_forever()
