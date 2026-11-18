import { Fragment, type ReactNode } from "react";

/**
 * Satz mit Hervorhebungen als ein Übersetzungsschlüssel:
 *   rich(t("Bis dein <b>Notgroschen</b> voll ist, …"), { b: (x) => <b>{x}</b> })
 * So kann jede Sprache die Wortstellung frei wählen. Tags dürfen nicht verschachtelt sein.
 */
export function rich(text: string, tags: Record<string, (chunk: ReactNode) => ReactNode>): ReactNode {
  const parts: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const render = tags[m[1]];
    parts.push(<Fragment key={i++}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
