import { MMKV } from 'react-native-mmkv';

export const settingsStorage = new MMKV({ id: 'fawn.settings' });

const CHAT_TTS_SPEAKER_ENABLED_KEY = 'chat.tts.speakerEnabled';

export function getChatTtsSpeakerEnabled(): boolean {
  return settingsStorage.getBoolean(CHAT_TTS_SPEAKER_ENABLED_KEY) ?? true;
}

export function setChatTtsSpeakerEnabled(enabled: boolean): void {
  settingsStorage.set(CHAT_TTS_SPEAKER_ENABLED_KEY, enabled);
}
