export function Infrastructure() {
  return <section className="infrastructure" aria-label="Project infrastructure">
    <div className="eyebrow">PROJECT INFRASTRUCTURE</div>
    <div className="infrastructure-grid">
      <article><h3>Gemini</h3><p>Agent reasoning / code generation</p></article>
      <article><h3>CreateOS Sandbox</h3><p>Isolated diagnostic execution<br />Fresh fix-validation environment</p></article>
      <article><h3>Stripe Projects</h3><p>Project/service provisioning<br />CreateOS + Railway services attached</p></article>
      <article><h3>Railway</h3><p>Production hosting for the Aegis control plane</p></article>
    </div>
  </section>;
}
