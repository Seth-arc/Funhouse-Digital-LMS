import React from 'react';
import './Logo.css';

const Logo: React.FC = () => {
  return (
    <div className="funhouse-logo">
      <img
        src="/fd_logo.svg"
        alt="FUNHOUSEDIGITAL"
        className="logo-image"
      />
    </div>
  );
};

export default Logo;
