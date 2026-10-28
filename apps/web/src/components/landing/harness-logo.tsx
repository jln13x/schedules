import Image from "next/image";

export function HarnessLogo({ logo, size = 24 }: { logo: string; size?: number }) {
  return (
    <Image
      src={logo}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
    />
  );
}
