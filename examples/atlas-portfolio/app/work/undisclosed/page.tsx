export const metadata = { robots: { index: false, follow: false } };
export default function Restricted() {
  return <main data-portfolio-access="protected"><h1>Restricted project</h1><p>This project requires access.</p></main>;
}
