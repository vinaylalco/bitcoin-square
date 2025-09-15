import { Link } from 'react-router-dom';

export default function PurchaseCancel() {
  return (
    <div className="p-4 text-center space-y-4">
      <h1 className="text-2xl font-bold">Payment canceled</h1>
      <p>Your payment was canceled.</p>
      <Link to="/my-courses" className="text-brand underline">
        Try Again
      </Link>
    </div>
  );
}
