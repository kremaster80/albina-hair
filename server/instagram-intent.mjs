// Polling can return story reactions as a one-emoji "message".
// Without a reliable event type, treat emoji-only/blank Instagram events as
// non-actionable: they may be appended to an existing open conversation,
// but they must never create a client, lead, or notification on their own.
const emojiCharacters=/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Variation_Selector}\p{Regional_Indicator}\u200D\u20E3\s]+$/u;
const hasEmoji=/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

export function isPassiveInstagramMessage(event){
  if(event?.source!=='instagram')return false;
  const message=typeof event.text==='string'?event.text.trim():'';
  return !message||(emojiCharacters.test(message)&&hasEmoji.test(message));
}
