const MESSAGES = [
  "HEY ROOKIE! This session's been waiting on you for an HOUR! You ghostin' it or what?",
  "FREEZE! Claude's been waiting since before lunch. You coming back or should I close the case?",
  "HANDS WHERE I CAN SEE 'EM! A session's been idle for 60 minutes. Time to make a call, partner.",
  "THIS IS THE STATUS POLICE! Claude's hanging. You want it on the clock or off the books?"
];

let sessionId = null;

function typewriter(element, text, speed = 35) {
  element.textContent = '';
  const cursor = document.createElement('span');
  cursor.className = 'cursor';
  let i = 0;
  const timer = setInterval(() => {
    if (i < text.length) {
      element.textContent += text[i++];
      element.appendChild(cursor);
    } else {
      clearInterval(timer);
    }
  }, speed);
}

window.claudeStatus.onDialogInit(({ sessionId: id }) => {
  sessionId = id;
  const msg = MESSAGES[Math.floor(Math.abs(id.charCodeAt(0)) % MESSAGES.length)];
  typewriter(document.getElementById('message'), msg);
  playFanfare();
});

document.getElementById('btn-keep').addEventListener('click', () => {
  if (sessionId) window.claudeStatus.keepWatching(sessionId);
});

document.getElementById('btn-dismiss').addEventListener('click', () => {
  if (sessionId) window.claudeStatus.dismissSession(sessionId);
});
