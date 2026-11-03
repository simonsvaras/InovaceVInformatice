export function Message({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (error) {
    return (
      <p className="message message-error" role="alert">
        {error}
      </p>
    );
  }

  if (success) {
    return (
      <p className="message message-success" role="status">
        {success}
      </p>
    );
  }

  return null;
}
