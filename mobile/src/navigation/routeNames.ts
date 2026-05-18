/**
 * Typed route-name constants for Fawn mobile navigation.
 *
 * All call sites MUST use these constants instead of raw string literals so
 * route renames are a single-file change and typos are caught at compile time.
 *
 * §D of the IA alignment table (2026-05-18) is the authoritative source for
 * the canonical route names listed here.
 */

export const ROUTES = {
  CHAT_LIST: 'ChatList',
  CHAT_CONVERSATION: 'ChatConversation',
  HISTORY_LIST: 'HistoryList',
  HISTORY_CONVERSATION: 'HistoryConversation',
  DASHBOARD_HOME: 'DashboardHome',
  RECORD_HOME: 'RecordHome',
  ALBUM_HOME: 'AlbumHome',
  PROFILE_HOME: 'ProfileHome',
  AGENT_TASKS: 'AgentTasks',
  MEMORY_FILE_LIST: 'MemoryFileList',
  MEMORY_FILE_EDITOR: 'MemoryFileEditor',
} as const;

export type RouteName = (typeof ROUTES)[keyof typeof ROUTES];
