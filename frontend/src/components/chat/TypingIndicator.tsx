export function TypingIndicator() {
  return (
    <div className="flex h-8 items-center gap-1 px-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-mid-gray"
          style={{ animation: `typing-dot 1.1s ${delay}ms infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}
