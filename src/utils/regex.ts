/**
 * Regex pattern for matching PagerDuty service mentions in monitor messages
 * Captures the service name without any template variables like {{/is_warning_recovery}}
 */
export const PAGERDUTY_SERVICE_REGEX = /@pagerduty-([\w\-_]+)/g;

/**
 * Regex pattern for matching Opsgenie service mentions in monitor messages
 * Captures the service name without any template variables
 */
export const OPSGENIE_SERVICE_REGEX = /@opsgenie-([\w\-_]+)/g;

/**
 * Get the appropriate regex pattern based on the provider
 * @param provider The alert provider ('pagerduty' or 'opsgenie')
 * @returns RegExp pattern for the specified provider
 */
export function getServiceRegexForProvider(provider: string): RegExp {
  return provider === 'opsgenie' ? OPSGENIE_SERVICE_REGEX : PAGERDUTY_SERVICE_REGEX;
}