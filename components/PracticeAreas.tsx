import {
  Briefcase,
  Building2,
  Gavel,
  Landmark,
  Scale,
  Shield,
  Plane,
  Ship,
  Fuel,
  Globe,
  FileCheck,
  Phone,
  ScrollText,
  Banknote,
} from "lucide-react";

const areas = [
  {
    icon: Building2,
    title: "Company & Corporate Affairs",
    description:
      "The firm covers all aspects of Company Law and Corporate Affairs. Briefs and works are undertaken for Companies, Government...",
  },
  {
    icon: Banknote,
    title: "Commercial Law, Banking & Taxation",
    description:
      "An initial concern of most international companies and foreign individuals...",
  },
  {
    icon: Shield,
    title: "Recovery of Debts",
    description:
      "In view of the fast changing trend in the global economic activities of our numerous clients, we have put in place...",
  },
  {
    icon: Landmark,
    title: "Property Law",
    description:
      "We undertake works on all aspects of Real Property Law, services include conducting inquiries at the Lands Registry and...",
  },
  {
    icon: Briefcase,
    title: "Intellectual & Industrial Property",
    description:
      "This is an area of law that is rapidly developing in Nigeria. Associates have...",
  },
  {
    icon: Gavel,
    title: "Litigation",
    description:
      "We are well groomed in litigation and have litigated cases and suits at the Magistrates Courts, Federal High Courts, High Courts...",
  },
  {
    icon: Globe,
    title: "Immigration",
    description:
      "Our effective networking arrangement with the various bodies charged with the regulation of immigration laws in the...",
  },
  {
    icon: Ship,
    title: "Shipping",
    description:
      "The Firm is well groomed in Shipping Law. We undertake various responsibilities for charterers, ship owners, brokers...",
  },
  {
    icon: Plane,
    title: "Aviation Related Matters",
    description:
      "The Firm has undertaken some matters in this sector particularly relating to various disputes necessitating the...",
  },
  {
    icon: Fuel,
    title: "Oil & Gas",
    description:
      "The dynamism of the Oil and Gas Sector in the Nigerian and Global economy has assumed a phenomenal level...",
  },
  {
    icon: FileCheck,
    title: "Licenses & Approvals",
    description:
      "Our effective networking arrangement with the National Agency for Food, Drugs Administration and Control (NAFDAC)...",
  },
  {
    icon: Phone,
    title: "Telecommunications",
    description:
      "The Firm is involved in various telecommunications transactions involving some telecommunications and courier...",
  },
  {
    icon: ScrollText,
    title: "Solicitors Works",
    description:
      "The Firm is designed in such a way that machineries have been put in place to ensure rapid response to the...",
  },
  {
    icon: Scale,
    title: "Arbitration",
    description:
      "Mediation, Conciliation or Arbitration has been embraced as a commercially convenient way of settling...",
  },
];

export default function PracticeAreas() {
  return (
    <section className="bg-[#F8F5F2] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            Practice Areas
          </p>

          <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">
            Sophisticated Legal Representation Across Critical Practice Areas
          </h2>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area, index) => {
            const Icon = area.icon;

            return (
              <div
                key={index}
                className="group border border-[#6D1F3B]/10 bg-white p-8 transition hover:-translate-y-1 hover:border-[#6D1F3B]/30"
              >
                <Icon className="h-10 w-10 text-[#6D1F3B]" />

                <h3 className="mt-6 font-serif text-2xl text-[#2B0D17]">
                  {area.title}
                </h3>

                <p className="mt-4 leading-relaxed text-gray-600">
                  {area.description}
                </p>

                <button className="mt-8 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                  Learn More →
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}