export type {
  DeviceInfo,
  FeedbackComment,
  FeedbackDetail,
  FeedbackRecord,
  FeedbackStatusItem,
  FeedbackSubmission,
  FeedbackSubmitResult,
  FeedbackType,
} from "./feedback-types";

export type { LogFileEntry } from "./feedback-service";

export {
  appendLog,
  appendStructuredLog,
  clearLogs,
  collectDeviceInfo,
  collectLogs,
  getFeedbackDetail,
  getFeedbackHistory,
  getLogDirectoryPath,
  getRemainingSubmissions,
  getUnreadFeedbackCount,
  installFeedbackLogCapture,
  listLogFiles,
  logDisplayLines,
  markFeedbackReplySeen,
  readLogFile,
  refreshAndCountUnreadFeedback,
  refreshFeedbackStatus,
  setFeedbackWorkerUrl,
  submitFeedback,
} from "./feedback-service";
