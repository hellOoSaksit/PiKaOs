const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** Custom title bar strip (Window Controls Overlay). The OS draws the window buttons on the
 *  right; this provides the draggable branding area on the left. Desktop-only. */
export default function TitleBar() {
  if (!desk()?.isDesktop) return null;
  return (
    <header className="titlebar" data-no-lex>
      <div className="titlebar-brand">
        <span className="titlebar-mark">P</span>
        <span className="titlebar-word">PiKaOs</span>
      </div>
      <div className="titlebar-drag" />
    </header>
  );
}
