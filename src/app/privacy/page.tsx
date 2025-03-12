import { type Metadata } from "next";

export const metadata: Metadata = {
  title: 'Privacy Policy | Force Flow',
  description: 'Privacy Policy for Force Flow - Learn how we protect your data and respect your privacy.',
};

export default function PrivacyPolicy() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <p className="text-gray-400 mb-8">Effective Date: March 12th, 2025</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
        <p className="text-gray-300 mb-4">
          Welcome to Force Flow. We value your privacy and are committed to protecting your personal information. 
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
          If you have any questions or concerns regarding this Privacy Policy, please contact us.
        </p>
      </section>
    </div>
  );
} 