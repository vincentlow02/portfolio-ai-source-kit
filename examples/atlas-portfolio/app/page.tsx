import Link from "next/link";

export default function Home() {
  return <main style={{ maxWidth: 640, margin: "70px auto", padding: 20 }}>
    <h1>Morgan Reed</h1>
    <p>I design public wayfinding tools for people who move through unfamiliar spaces.</p>
    <nav aria-label="Selected work"><ul>
      <li><Link href="/work/lantern">Lantern</Link></li>
      <li><Link href="/case-studies/signal">Signal</Link></li>
      <li><Link href="/journal/field-notes">Field notes</Link></li>
    </ul></nav>
  </main>;
}
