export function getFormPayload(form) {
  const payload = {};
  const formData = new FormData(form);

  for (const [name, value] of formData.entries()) {
    const field = form.elements[name];
    const normalizedValue = normalizeFormValue(value, field);
    if (payload[name] === undefined) {
      payload[name] = normalizedValue;
    } else if (Array.isArray(payload[name])) {
      payload[name].push(normalizedValue);
    } else {
      payload[name] = [payload[name], normalizedValue];
    }
  }

  return payload;
}

export function handleFormSubmit(callback) {
  return (event) => {
    event.preventDefault();
    const result = callback(getFormPayload(event.currentTarget));
    if (result !== false) event.currentTarget.reset();
  };
}

function normalizeFormValue(value, field) {
  if (typeof value !== "string") return value;
  if (!shouldUppercaseField(field)) return value.trim();

  if (field?.tagName === "TEXTAREA") {
    return value
      .split(/\r?\n/)
      .map((line) => normalizeText(line))
      .filter(Boolean)
      .join("\n");
  }

  return normalizeText(value);
}

function normalizeText(value) {
  return value
    .normalize("NFC")
    .replace(/[ \t]+/g, " ")
    .trim()
    .toLocaleUpperCase("es-MX");
}

function shouldUppercaseField(field) {
  const isRadioList = typeof RadioNodeList !== "undefined" && field instanceof RadioNodeList;
  const target = Array.isArray(field) || isRadioList ? field[0] : field;
  if (!target) return true;
  if (target.tagName === "SELECT") return false;

  const name = String(target.name || "").toLowerCase();
  if (name.includes("email") || name.includes("password") || name.includes("code")) return false;

  const type = String(target.type || "text").toLowerCase();
  return !["button", "checkbox", "color", "date", "email", "file", "hidden", "number", "password", "radio", "reset", "submit", "time"].includes(type);
}
