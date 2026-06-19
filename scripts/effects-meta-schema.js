const HTML_EXTENSION = ".html";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\([1-9][0-9]*\))?$/;
const ISO_LIKE_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function describeValue(value) {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hrefBasename(href) {
  if (typeof href !== "string" || !href.endsWith(HTML_EXTENSION)) {
    return "";
  }

  return href.slice(0, -HTML_EXTENSION.length);
}

export function validateNonEmptyTrimmedString(value, label) {
  if (typeof value !== "string") {
    return [`${label} must be a string; received ${describeValue(value)}.`];
  }

  if (!value.trim()) {
    return [`${label} must be a non-empty string.`];
  }

  if (value !== value.trim()) {
    return [`${label} must not have leading or trailing whitespace.`];
  }

  return [];
}

export function validateOptionalTrimmedString(value, label) {
  if (typeof value !== "string") {
    return [`${label} must be a string; received ${describeValue(value)}.`];
  }

  if (value === "") {
    return [];
  }

  return validateNonEmptyTrimmedString(value, label);
}

export function validateArrayOfNonEmptyStrings(value, label) {
  if (!Array.isArray(value)) {
    return [`${label} must be an array of non-empty strings.`];
  }

  return value.flatMap((item, index) =>
    validateNonEmptyTrimmedString(item, `${label}[${index}]`),
  );
}

export function validateRootHtmlHref(value, label) {
  const issues = validateNonEmptyTrimmedString(value, label);
  if (issues.length > 0) {
    return issues;
  }

  if (value === "index.html") {
    return [`${label} must reference an effect page, not index.html.`];
  }

  if (value.includes("/") || value.includes("\\")) {
    return [
      `${label} must be a root-level .html file without path separators; received "${value}".`,
    ];
  }

  if (!value.endsWith(HTML_EXTENSION)) {
    return [`${label} must end with .html; received "${value}".`];
  }

  if (!hrefBasename(value)) {
    return [`${label} must include a filename before .html.`];
  }

  return [];
}

export function validateIsoLikeTimestampString(value, label) {
  const issues = validateNonEmptyTrimmedString(value, label);
  if (issues.length > 0) {
    return issues;
  }

  if (!ISO_LIKE_TIMESTAMP_PATTERN.test(value)) {
    return [
      `${label} must be an ISO-like timestamp such as 2026-05-02T12:02:12+03:00 or 2026-05-02T09:02:12.000Z; received "${value}".`,
    ];
  }

  const parsedTime = Date.parse(value);
  if (Number.isNaN(parsedTime)) {
    return [`${label} must be a real parseable timestamp; received "${value}".`];
  }

  return [];
}

export function validateSlug(value, label) {
  const issues = validateNonEmptyTrimmedString(value, label);
  if (issues.length > 0) {
    return issues;
  }

  if (value.endsWith(HTML_EXTENSION)) {
    return [`${label} must not include the .html extension.`];
  }

  if (value.includes("/") || value.includes("\\")) {
    return [`${label} must not include path separators; received "${value}".`];
  }

  if (!SLUG_PATTERN.test(value)) {
    return [
      `${label} must use lowercase letters, numbers, hyphen separators, and an optional numeric parenthesized suffix; received "${value}".`,
    ];
  }

  return [];
}

export function validateSlugMatchesHrefBasename(slug, href, label) {
  if (typeof slug !== "string" || typeof href !== "string") {
    return [
      `${label} slug-to-href check requires string slug and href values.`,
    ];
  }

  const basename = hrefBasename(href);
  if (slug !== basename) {
    return [
      `${label}.slug "${slug}" must exactly match href basename "${basename}" from ${label}.href "${href}".`,
    ];
  }

  return [];
}

export function validateCatalogEntry(entry, index) {
  const label = `effects[${index}]`;

  if (!isPlainObject(entry)) {
    return [`${label} must be an object.`];
  }

  return [
    ...validateRootHtmlHref(entry.href, `${label}.href`),
    ...validateNonEmptyTrimmedString(entry.category, `${label}.category`),
    ...validateArrayOfNonEmptyStrings(entry.tags, `${label}.tags`),
  ];
}

export function validateOverrideEntry(slug, override) {
  const label = `overrides.${slug}`;

  if (!isPlainObject(override)) {
    return [`${label} must be an object keyed by optional metadata fields.`];
  }

  const issues = [];

  if (Object.hasOwn(override, "category")) {
    issues.push(
      ...validateNonEmptyTrimmedString(override.category, `${label}.category`),
    );
  }

  if (Object.hasOwn(override, "description")) {
    issues.push(
      ...validateOptionalTrimmedString(
        override.description,
        `${label}.description`,
      ),
    );
  }

  if (Object.hasOwn(override, "tags")) {
    issues.push(...validateArrayOfNonEmptyStrings(override.tags, `${label}.tags`));
  }

  return issues;
}

export function validateGeneratedMetadataRecord(record, index) {
  const label = `entry ${index}`;

  if (!isPlainObject(record)) {
    return [`${label} must be an object metadata record.`];
  }

  return [
    ...validateSlug(record.slug, `${label}.slug`),
    ...validateNonEmptyTrimmedString(record.title, `${label}.title`),
    ...validateRootHtmlHref(record.href, `${label}.href`),
    ...validateNonEmptyTrimmedString(record.category, `${label}.category`),
    ...validateArrayOfNonEmptyStrings(record.tags, `${label}.tags`),
    ...validateOptionalTrimmedString(record.description, `${label}.description`),
    ...validateIsoLikeTimestampString(record.createdAt, `${label}.createdAt`),
    ...validateSlugMatchesHrefBasename(record.slug, record.href, label),
  ];
}
