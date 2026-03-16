import { ProfileForm } from "./profile-form";

export default function ProfilePage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Your Profile</h1>
      <ProfileForm />
    </main>
  );
}
