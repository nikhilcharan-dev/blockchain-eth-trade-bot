'use client'
import {useEffect, useRef} from "react";
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import "./NavButton.css";

export default function NavigationButton({ title, url }) {
    const router = useRouter();
    const navigate = () => (router.push(url));
    const buttonRef = useRef(null);

    const handleClickAnimation = () => {
        requestAnimationFrame(() => {
            const tl = gsap.timeline();

            tl
            .from(buttonRef.current, {
                borderRadius: "0",
                duration: 0.1
            })
            .to(buttonRef.current, {
                borderRadius: "0",
                height: "150svh",
                width: "150svw",
                duration: 0.7,
                ease: "power2.InOut"
            })
            .call(() => navigate(), null, "+=.5");
        })
    }

    return (
        <div className="nav-button">
            <button onClick={handleClickAnimation} ref={buttonRef}>
                {title}
            </button>
        </div>
    )
}