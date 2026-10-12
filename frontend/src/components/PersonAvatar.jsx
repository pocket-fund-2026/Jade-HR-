// Read-only photo for any person in a list: their photo, else a coloured
// initial. The colour is derived from the name so it stays stable.
const TINTS = ["bg-jade-600", "bg-ledger-700", "bg-ochre-600", "bg-rust-500", "bg-ink/70"];

export default function PersonAvatar({ person, className = "w-8 h-8" }) {
  const name = `${person?.first_name || ""} ${person?.last_name || ""}`.trim() || "?";
  if (person?.avatar_url) {
    return <img src={person.avatar_url} alt="" loading="lazy" className={`${className} rounded-full object-cover flex-shrink-0`} />;
  }
  const tint = TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <span aria-hidden="true" className={`${className} ${tint} rounded-full text-white text-xs font-semibold flex items-center justify-center flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
