'use client';

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

interface AddressProps {
  address: string;
  className?: string;
  showFull?: boolean;
}

export function Address({ address, className, showFull = false }: AddressProps) {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  if (showFull) {
    return <span className={cn("font-mono", className)}>{address}</span>;
  }

  return (
    <Tooltip content={address}>
      <span className={cn("font-mono cursor-help", className)}>
        {shortAddress}
      </span>
    </Tooltip>
  );
}
