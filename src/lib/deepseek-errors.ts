import type { DeepSeekErrorCode } from "./deepseek-client";

const DEEPSEEK_ERROR_MESSAGES: Record<DeepSeekErrorCode, string> = {
  aborted: "AI 生成服务已取消，已保留本地规则结果。",
  http_error: "AI 生成服务暂不可用，已改用本地规则回退。",
  invalid_config: "AI 生成服务配置暂不可用，已改用本地规则回退。",
  invalid_messages: "本次请求暂无法发送给 AI，已使用本地规则结果。",
  invalid_response: "AI 返回内容格式异常，已改用本地规则回退。",
  json_parse_error: "AI 返回 JSON 格式异常，已改用本地规则回退。",
  missing_api_key: "AI 生成服务未配置，已改用本地规则回退。",
  missing_base_url: "AI 生成服务未配置，已改用本地规则回退。",
  missing_model: "AI 生成服务未配置，已改用本地规则回退。",
  network_error: "AI 生成服务连接失败，已改用本地规则回退。",
  timeout: "AI 生成服务响应超时，已改用本地规则回退。",
};

export function getDeepSeekFallbackMessage(code: string | undefined): string {
  if (isDeepSeekErrorCode(code)) {
    return DEEPSEEK_ERROR_MESSAGES[code];
  }

  return "AI 生成服务暂不可用，已改用本地规则回退。";
}

function isDeepSeekErrorCode(code: string | undefined): code is DeepSeekErrorCode {
  return Boolean(code && code in DEEPSEEK_ERROR_MESSAGES);
}
