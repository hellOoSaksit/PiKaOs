import FeatureTag from './FeatureTag.jsx';

// Page header inside content
export default function PageHead({ kicker, title, desc, actions, tag }) {
  return (
    <div className="page-head">
      <div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {kicker && <div className="kicker">{kicker}</div>}
          {tag && <FeatureTag kind={tag} />}
        </div>
        <h2 className="page-title">{title}</h2>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="row" style={{ gap: 10 }}>{actions}</div>}
    </div>
  );
}
