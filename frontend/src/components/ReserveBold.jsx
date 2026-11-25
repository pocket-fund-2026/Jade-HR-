// A label whose bold width is reserved up front, for tabs and links that go
// bold when active (see .rb in index.css).
export default function ReserveBold({ children }) {
  return <span className="rb" data-text={typeof children === "string" ? children : undefined}>{children}</span>;
}
