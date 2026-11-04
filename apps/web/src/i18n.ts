import { i18n } from "@lingui/core";
import type { Locale } from "@/lib/ui-store";
import { messages as en } from "./locales/en/messages.po";

i18n.load("en", en);
i18n.activate("en");

/** Hindi loads on demand so the English shell stays inside the JS budget. */
export async function activateLocale(locale: Locale): Promise<void> {
  if (locale === "hi") {
    const { messages } = await import("./locales/hi/messages.po");
    i18n.load("hi", messages);
  }
  i18n.activate(locale);
  document.documentElement.lang = locale;
}

export { i18n };
