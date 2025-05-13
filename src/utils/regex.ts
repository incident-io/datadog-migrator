/**
 * Regex pattern for matching PagerDuty service mentions in monitor messages
 * Captures the service name without any template variables like {{/is_warning_recovery}}
 */
export const PAGERDUTY_SERVICE_REGEX = /@pagerduty-([\w\-_]+)/g;