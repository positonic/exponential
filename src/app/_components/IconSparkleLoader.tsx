import React from "react";
import Image from "next/image";
import sparkle from "../media/sparkle.svg";

interface Props {
  className?: string;
  isBlack?: boolean;
}

const IconSparkleLoader = ({ className, isBlack = false }: Props) => {
  return (
    <Image
      src={sparkle}
      alt="loader"
      className={
        isBlack ? "filter invert" : ""
      }
    />
  );
};

export default IconSparkleLoader;
