set -e
E=/Users/suziming/Documents/AI/river/evidence/T10
ev() { node cdp.mjs eval "$1"; }
click() { ev "(()=>{const b=[...document.querySelectorAll('button,a,[role=button]')].find(x=>x.textContent.trim()==='$1');b.scrollIntoView({block:'center'});b.click();return 'clicked $1'})()"; }
see() { ev "(()=>{[...document.querySelectorAll('*')].find(x=>!x.childElementCount&&x.textContent.trim()==='$1').scrollIntoView({block:'center'});return 1})()" >/dev/null; }
ev "document.querySelector('[role=dialog]')?.innerText.slice(0,200)"; node cdp.mjs shot $E/1-onboarding-lang-zh.png
click English; sleep 0.4; node cdp.mjs shot $E/2-onboarding-lang-en-preview.png
click 中文; sleep 0.3; click 跳过; sleep 1
ev "window.river.invoke('app.bootstrap').then(b=>({locale:b.settings.locale,onb:b.onboarded,cur:b.settings.currency,li:b.personas.find(p=>p.id==='li').name}))"
click 设置; sleep 0.5; see 语言; sleep 0.3; node cdp.mjs shot $E/3-settings-zh.png
click English; sleep 0.8; see Language; sleep 0.3; node cdp.mjs shot $E/4-settings-en.png
click 'AI Opponents'; sleep 0.6; node cdp.mjs shot $E/5-opponents-en-ui-zh-presets.png
ev "document.body.innerText.slice(60,330)"
click Settings; sleep 0.5; click Open; sleep 0.7; node cdp.mjs shot $E/6-rules-from-settings-no-lang-page.png
ev "document.querySelector('[role=dialog]')?.innerText.slice(0,200)"
ev "window.river.invoke('app.bootstrap').then(b=>({locale:b.settings.locale,cur:b.settings.currency,li:b.personas.find(p=>p.id==='li').name}))"
