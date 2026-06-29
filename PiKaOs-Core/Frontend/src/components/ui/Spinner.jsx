/** Spinner — 15px ring, .7s linear. `dark` variant for neutral surfaces. */
export default function Spinner({ dark = false, className = '', style }) {
  return <span className={'spinner' + (dark ? ' dark' : '') + (className ? ' ' + className : '')} style={style} />;
}
