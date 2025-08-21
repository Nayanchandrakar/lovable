import { Navbar } from "@/modules/home/ui/components/navbar";
import { HeroSection } from "@/components/global/hero-section";
import { ProjectsList } from "@/modules/home/ui/components/projects-list";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <ProjectsList />
    </>
  );
}