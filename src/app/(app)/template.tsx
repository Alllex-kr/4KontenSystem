/** Wird bei jedem Seitenwechsel neu gerendert: blendet die neue Seite weich ein. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
