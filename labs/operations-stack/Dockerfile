FROM python:3.12-slim-bookworm
ARG RELEASE=v1
ENV SIT_RELEASE=${RELEASE} PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /lab
RUN mkdir -p /data && chown 10001:10001 /data
COPY service.py /lab/service.py
USER 10001:10001
CMD ["python", "/lab/service.py"]
