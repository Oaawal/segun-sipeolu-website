import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import AboutPreview from "@/components/AboutPreview";
import StatsSection from "@/components/StatsSection";
import OfficeShowcase from "@/components/OfficeShowcase";
import PracticeAreas from "@/components/PracticeAreas";
import WhyChooseUs from "@/components/WhyChooseUs";
import AttorneysSection from "@/components/AttorneysSection";
import Testimonials from "@/components/Testimonials";
import InsightsPreview from "@/components/InsightsPreview";
import ConsultationCTA from "@/components/ConsultationCTA";
import ContactStrip from "@/components/ContactStrip";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <AboutPreview />
        <StatsSection />
        <OfficeShowcase />
        <PracticeAreas />
        <WhyChooseUs />
        <AttorneysSection />
        <Testimonials />
        <InsightsPreview />
        <ConsultationCTA />
      </main>
      <ContactStrip />
      <Footer />
      <WhatsAppButton />
    </>
  );
}