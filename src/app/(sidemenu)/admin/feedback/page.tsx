import { FeedbackDashboard } from "./FeedbackDashboard";
import { ThreadScoreAnalytics } from "./ThreadScoreAnalytics";

export default function FeedbackPage() {
  return (
    <div className="space-y-10">
      <FeedbackDashboard />
      <ThreadScoreAnalytics />
    </div>
  );
}
