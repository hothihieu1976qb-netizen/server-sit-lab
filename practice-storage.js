'use strict';

const PRACTICE_INDEX_KEY='sit-practice-index-v1';
const PRACTICE_LEARNED_KEY='sit-practice-learned-v1';
const practiceRunKey=(kind,id)=>'sit-practice-v1:'+kind+':'+id;
let storedPracticeIndex='', knownPracticeKeys=new Set();
const pendingPracticeNotes=new Set();
let practiceNoteTimer;
let practiceStoreReady=false;

function readPracticeStore(legacy){
  const fallback=legacy||{guided:null,cases:[],selectedCase:''};
  try{
    const packed=localStorage.getItem(PRACTICE_INDEX_KEY);
    if(!packed)return fallback;
    const index=JSON.parse(packed);
    const get=(kind,id)=>{
      const key=practiceRunKey(kind,id), raw=localStorage.getItem(key);
      if(!raw)throw Error('missing saved simulation');
      knownPracticeKeys.add(key);
      return JSON.parse(raw);
    };
    const courses=Object.fromEntries(index.courses.map(id=>[id,get('course',id)]));
    const cases=index.cases.map(id=>get('case',id));
    storedPracticeIndex=packed;practiceStoreReady=true;
    return {...index,courses,cases};
  }catch(_){
    knownPracticeKeys.clear();
    return fallback;
  }
}

function restorePracticeLearned(coach){
  try{Object.assign(coach.learned,JSON.parse(localStorage.getItem(PRACTICE_LEARNED_KEY)||'{}'));}
  catch(_){}
}

function learnPracticeCommand(segment,event){
  if(!segment?.spec||event.failed||!event.kind||['help','history'].includes(event.kind)||S.coach.learned[segment.key])return;
  S.coach.learned[segment.key]={at:event.at,last:event.raw};
  try{localStorage.setItem(PRACTICE_LEARNED_KEY,JSON.stringify(S.coach.learned));}catch(_){}
}

function persistPractice(run){
  const {courses,cases,guidedId,selectedCase}=S.experience;
  const index={guidedId,selectedCase,courses:Object.keys(courses),cases:cases.map(item=>item.id)};
  const byKey=new Map([
    ...Object.entries(courses).map(([id,item])=>[practiceRunKey('course',id),item]),
    ...cases.map(item=>[practiceRunKey('case',item.id),item])
  ]);
  try{
    for(const [key,item] of byKey){
      if(knownPracticeKeys.has(key)&&item!==run)continue;
      localStorage.setItem(key,JSON.stringify(item));
      knownPracticeKeys.add(key);
      pendingPracticeNotes.delete(item);
    }
    const packed=JSON.stringify(index);
    if(packed!==storedPracticeIndex){localStorage.setItem(PRACTICE_INDEX_KEY,packed);storedPracticeIndex=packed;}
    for(const key of knownPracticeKeys){
      if(!byKey.has(key)){localStorage.removeItem(key);knownPracticeKeys.delete(key);}
    }
    practiceStoreReady=true;
  }catch(_){toast('浏览器存储写入失败，本轮还在内存中。可先导出学习证据或案例。');}
}

function flushPracticeNotes(){
  clearTimeout(practiceNoteTimer);
  for(const run of [...pendingPracticeNotes])persistPractice(run);
}

function deferPracticeNote(run){
  pendingPracticeNotes.add(run);
  clearTimeout(practiceNoteTimer);
  practiceNoteTimer=setTimeout(flushPracticeNotes,320);
}
