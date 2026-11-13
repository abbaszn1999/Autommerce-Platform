export interface MatchingRule {
  type: string;
  enabled: boolean;
  label: string;
  description: string;
  value?: string;
  pattern?: string;
}

export function normalizeValue(value: string, rules: MatchingRule[]): string {
  let result = value;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.type) {
      case "trim_whitespace":
        result = result.trim();
        break;
      case "case_insensitive":
        result = result.toLowerCase();
        break;
      case "ignore_prefix":
        if (rule.value && result.toLowerCase().startsWith(rule.value.toLowerCase())) {
          result = result.slice(rule.value.length);
        }
        break;
      case "ignore_suffix":
        if (rule.value && result.toLowerCase().endsWith(rule.value.toLowerCase())) {
          result = result.slice(0, -rule.value.length);
        }
        break;
      case "strip_non_alnum":
        result = result.replace(/[^a-zA-Z0-9]/g, "");
        break;
      case "regex_extract":
        if (rule.pattern) {
          try {
            const match = result.match(new RegExp(rule.pattern));
            if (match && match[0]) result = match[0];
          } catch {
            // Invalid regex, skip
          }
        }
        break;
    }
  }

  return result;
}
