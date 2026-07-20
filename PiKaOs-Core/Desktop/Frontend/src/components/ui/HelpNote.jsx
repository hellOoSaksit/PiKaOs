import FeatureTag from './FeatureTag.jsx';

/* small inline help note explaining a command in plain Thai */
export default function HelpNote({ children, tag }) {
  return (
    <div className="help-note">
      <span className="help-note-ic">ⓘ</span>
      <span className="help-note-text">{children}</span>
      {tag && <FeatureTag kind={tag} />}
    </div>
  );
}
