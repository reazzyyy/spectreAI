export function TextComparison({
  before,
  after,
  beforeLabel = "Исходная редакция",
  afterLabel = "Предлагаемая редакция",
}: {
  before: string
  after: string
  beforeLabel?: string
  afterLabel?: string
}) {
  const oldParts = before.split("\n\n")
  const newParts = after.split("\n\n")
  return (
    <div className="text-comparison">
      <section>
        <h3>{beforeLabel}</h3>
        <div>
          {oldParts.map((line, i) => (
            <p
              className={newParts.includes(line) ? "" : "diff-removed"}
              key={i}
            >
              {line || " "}
            </p>
          ))}
        </div>
      </section>
      <section>
        <h3>{afterLabel}</h3>
        <div>
          {newParts.map((line, i) => (
            <p className={oldParts.includes(line) ? "" : "diff-added"} key={i}>
              {line || " "}
            </p>
          ))}
        </div>
      </section>
    </div>
  )
}
