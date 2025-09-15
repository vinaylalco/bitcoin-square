import { Link } from 'react-router-dom';

export default function PurchaseSuccess() {
  return (
    <div className="p-4 text-center space-y-4">
      <h1 className="text-2xl font-bold">Purchase Successful</h1>
      <p>Your payment was processed successfully.</p>
      <Link to="/my-courses" className="text-brand underline">
        My Courses
      </Link>
    </div>
  );
}
