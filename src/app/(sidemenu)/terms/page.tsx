import { type Metadata } from "next";

export const metadata: Metadata = {
  title: 'Terms of Use | Force Flow',
  description: 'Terms of Use for Force Flow - Understanding your rights and responsibilities when using our service.',
};

export default function TermsOfUse() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Terms of Use</h1>
      
      <p className="text-gray-400 mb-8">Effective Date: March 12th, 2025</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
        <p className="text-gray-300 mb-4">
          By using Force Flow, you agree to these Terms of Use. Please read them carefully before using our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
        <p className="text-gray-300 mb-4">
          Your access and use of our service imply your agreement to be bound by these terms. 
          If you do not agree, please do not use the service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">User Responsibilities</h2>
        <ul className="list-disc pl-5 text-gray-300 space-y-2">
          <li>You agree to use the service in compliance with all applicable laws.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You agree not to misuse or attempt to circumvent any security features of the service.</li>
          <li>You are responsible for all activities that occur under your account.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Intellectual Property</h2>
        <p className="text-gray-300 mb-4">
          All content, design, and functionality provided through the service are the property of Force Flow 
          or its licensors. Unauthorized use, reproduction, or distribution is prohibited.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Disclaimers and Limitations</h2>
        <p className="text-gray-300 mb-4">
          The service is provided &quot;as is&quot; without any warranties. We are not liable for any indirect 
          or consequential damages arising from its use.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Governing Law</h2>
        <p className="text-gray-300 mb-4">
          These Terms are governed by the laws of Ireland. Disputes will be resolved in the 
          applicable courts of that jurisdiction.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Modifications</h2>
        <p className="text-gray-300 mb-4">
          We reserve the right to update these Terms at any time. Continued use of the service 
          constitutes your acceptance of the revised terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Contact</h2>
        <p className="text-gray-300">
          For any questions regarding these Terms, please contact us.
        </p>
      </section>
    </div>
  );
} 