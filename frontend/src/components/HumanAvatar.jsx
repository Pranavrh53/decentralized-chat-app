import React from "react";

/**
 * Human-like avatar unique per wallet address.
 * Uses DiceBear avataaars API - deterministic cartoon human avatars.
 * Same address always returns the same avatar.
 */
const HumanAvatar = ({ address, size = 40, style = {} }) => {
  const seed = address && address.startsWith("0x") && address.length >= 10
    ? address
    : "0x0000000000000000000000000000000000000000";
  const url = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&radius=50`;

  return (
    <img
      src={url}
      alt="avatar"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border: "2px solid rgba(255,60,0,0.4)",
        boxShadow: "0 0 12px rgba(255,60,0,0.2)",
        ...style,
      }}
    />
  );
};

export default HumanAvatar;
