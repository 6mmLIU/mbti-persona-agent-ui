/* Line icons — uniform stroke 1.75, 24-grid, currentColor. */
const Icon = ({ name, size = 20, stroke = 1.75, className = '' }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
              strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    send:   <><path {...p} d="M5 12h13M13 6l6 6-6 6"/></>,
    spark:  <><path {...p} d="M12 3l1.7 5.1a3 3 0 0 0 1.9 1.9L20.7 12l-5.1 1.7a3 3 0 0 0-1.9 1.9L12 20.7l-1.7-5.1a3 3 0 0 0-1.9-1.9L3.3 12l5.1-1.7a3 3 0 0 0 1.9-1.9z"/></>,
    sliders:<><path {...p} d="M5 6h14M5 12h14M5 18h14"/><circle {...p} cx="9" cy="6" r="2"/><circle {...p} cx="15" cy="12" r="2"/><circle {...p} cx="11" cy="18" r="2"/></>,
    clock:  <><circle {...p} cx="12" cy="12" r="8.4"/><path {...p} d="M12 7.4V12l3 1.8"/></>,
    star:   <><path {...p} d="M12 4.2l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 16.9l-4.6 2.4.9-5.2L4.5 9.7l5.2-.7z"/></>,
    starF:  <><path d="M12 4.2l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 16.9l-4.6 2.4.9-5.2L4.5 9.7l5.2-.7z" fill="currentColor" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round"/></>,
    plus:   <><path {...p} d="M12 5v14M5 12h14"/></>,
    edit:   <><path {...p} d="M14.5 5.5l4 4M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19l-4 1z"/></>,
    trash:  <><path {...p} d="M4.5 6.5h15M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5M6.5 6.5 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12.5"/></>,
    close:  <><path {...p} d="M6 6l12 12M18 6 6 18"/></>,
    grid:   <><rect {...p} x="4" y="4" width="7" height="7" rx="2"/><rect {...p} x="13" y="4" width="7" height="7" rx="2"/><rect {...p} x="4" y="13" width="7" height="7" rx="2"/><rect {...p} x="13" y="13" width="7" height="7" rx="2"/></>,
    list:   <><path {...p} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></>,
    copy:   <><rect {...p} x="9" y="9" width="11" height="11" rx="2.4"/><path {...p} d="M5 15H4a1.5 1.5 0 0 1-1.5-1.5V5A2.5 2.5 0 0 1 5 2.5h8.5A1.5 1.5 0 0 1 15 4v1"/></>,
    check:  <><path {...p} d="M5 12.5l4.5 4.5L19 7"/></>,
    chevron:<><path {...p} d="M9 6l6 6-6 6"/></>,
    chevDown:<><path {...p} d="M6 9l6 6 6-6"/></>,
    refresh:<><path {...p} d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v3.5H16"/></>,
    home:   <><path {...p} d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10"/></>,
    user:   <><circle {...p} cx="12" cy="8.5" r="3.7"/><path {...p} d="M5 20a7 7 0 0 1 14 0"/></>,
    layers: <><path {...p} d="M12 3.5 21 8l-9 4.5L3 8z"/><path {...p} d="M3 13l9 4.5L21 13"/></>,
    bookmark:<><path {...p} d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-3.4L5.5 20V5.5a1 1 0 0 1 1-1z"/></>,
  };
  return (
    <span className={'ico ' + className} aria-hidden="true" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24">{paths[name] || null}</svg>
    </span>
  );
};
window.Icon = Icon;
