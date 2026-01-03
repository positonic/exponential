import { type Metadata } from "next";

export const metadata: Metadata = {
  title: 'Privacy Policy | Exponential',
  description: 'Privacy Policy for Exponential - Learn how we protect your data and respect your privacy.',
};

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>

      <p className="text-gray-400 mb-8">Effective Date: January 3rd, 2026</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
        <p className="text-gray-300 mb-4">
          Welcome to Exponential. We value your privacy and are committed to protecting your personal information.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your data when you use our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
        <ul className="list-disc pl-5 text-gray-300 space-y-2">
          <li>
            <strong>Personal Information:</strong> Such as your name, email address, and any details you voluntarily provide.
          </li>
          <li>
            <strong>Usage Data:</strong> Information about how you interact with our service, including logs and cookies,
            to help us improve the service.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Google Calendar Integration</h2>
        <p className="text-gray-300 mb-4">
          When you connect your Google Calendar to Exponential, we access and use your calendar data as follows:
        </p>
        <ul className="list-disc pl-5 text-gray-300 space-y-2">
          <li>
            <strong>Data We Access:</strong> We read your calendar events including event titles, times, descriptions,
            and attendee information to display your schedule within the app.
          </li>
          <li>
            <strong>How We Use It:</strong> Calendar data is used solely to display your events and help you plan your day.
            We do not modify, delete, or create calendar events.
          </li>
          <li>
            <strong>Data Storage:</strong> Calendar events are cached temporarily (up to 15 minutes) to improve performance.
            We do not permanently store your calendar data on our servers.
          </li>
          <li>
            <strong>Data Sharing:</strong> We do not share, sell, or transfer your Google Calendar data to any third parties.
          </li>
          <li>
            <strong>Revoking Access:</strong> You can disconnect your Google Calendar at any time from your account settings,
            which will immediately remove our access to your calendar data.
          </li>
        </ul>
        <p className="text-gray-300 mt-4">
          Our use of Google Calendar data adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
        <p className="text-gray-300 mb-4">We use your data to:</p>
        <ul className="list-disc pl-5 text-gray-300 space-y-2">
          <li>Provide, maintain, and improve our service</li>
          <li>Communicate important updates and promotions</li>
          <li>Ensure compliance with legal obligations</li>
          <li>Enhance user experience through analytics</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Data Sharing and Security</h2>
        <p className="text-gray-300 mb-4">
          We do not sell your personal data. We may share your information only with trusted third parties
          or as required by law. We use industry-standard measures to safeguard your information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
        <p className="text-gray-300 mb-4">
          You may access, update, or request deletion of your data. For any privacy-related inquiries,
          please contact us using the details below.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Contact</h2>
        <p className="text-gray-300">
          If you have any questions or concerns regarding this Privacy Policy, please contact us at{' '}
          <a
            href="mailto:privacy@exponential.im"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            privacy@exponential.im
          </a>
        </p>
      </section>
    </div>
  );
} 