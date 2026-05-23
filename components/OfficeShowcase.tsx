import Image from "next/image";

export default function OfficeShowcase() {
  return (
    <section className="bg-[#F8F5F2] py-24">
      <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:items-center">
        <div className="relative overflow-hidden">
          <Image
            src="/office.jpg"
            alt="Segun Sipeolu & Associates Office"
            width={900}
            height={700}
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            Our Chambers
          </p>

          <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
            A professional legal environment designed for excellence and client confidence.
          </h2>

          <p className="mt-8 text-lg leading-relaxed text-gray-600">
            Located in Ikeja, Lagos, Segun Sipeolu & Associates provides
            sophisticated legal services within a professional and client-focused
            environment built on trust, integrity, and institutional excellence.
          </p>

          <div className="mt-10 flex flex-wrap gap-6">
            <div>
              <h3 className="font-serif text-4xl text-[#6D1F3B]">30+</h3>
              <p className="mt-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                Years Experience
              </p>
            </div>

            <div>
              <h3 className="font-serif text-4xl text-[#6D1F3B]">3000+</h3>
              <p className="mt-2 text-sm uppercase tracking-[0.2em] text-gray-500">
                Clients Served
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}