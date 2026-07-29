import Script from "next/script";

export function StaticShell({
  styleText,
  scripts,
  children,
  scriptOverrides,
}: {
  styleText: string;
  scripts: string[];
  children: React.ReactNode;
  scriptOverrides?: ((script: string, index: number) => string)[];
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleText }} />
      {children}
      {scripts.map((script, index) => {
        const updatedScript = (scriptOverrides ?? []).reduce(
          (value, override) => override(value, index),
          script,
        );

        return (
          <Script
            id={`shell-script-${index}`}
            key={`shell-script-${index}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: updatedScript }}
          />
        );
      })}
    </>
  );
}
