interface ErrorAlertProps {
  message: string;
}

export function ErrorAlert({ message }: ErrorAlertProps) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}
