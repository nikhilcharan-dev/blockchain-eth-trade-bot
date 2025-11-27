"use client";

import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import NavigationButton from "@/components/NavigationButton/NavButton";
import "./styles.css";

export default function page() {
    const [loggedIn, setLoggedIn] = useState(false);
    const [username, setUsername] = useState("Wanderer");
    const [text, setText] = useState("");
    const [content, setContent] = useState(false);

    const textRef = useRef(null);

    useEffect(() => {
        const stored = JSON.parse(localStorage.getItem("id"));
        const isUserLoggedIn = stored !== null;
        setLoggedIn(isUserLoggedIn);

        const newName = isUserLoggedIn ? "Nikhil Charan" : "Wanderer";
        setUsername(newName);
        setText(`Welcome, ${newName}`);

        const tl = gsap.timeline();

        tl.from(textRef.current, {
            scale: 0.5,
            opacity: 0,
            y: 70,
            duration: 1,
        })
        .to(textRef.current, {
            opacity: 1,
            scale: 1.2,
            duration: 0.5,
            ease: "power2.inOut",
        })
        .to(textRef.current, {
            scale: 1,
            duration: 0.4,
        })
        .call(() => {
            setText(`${newName}`);
        }, null, "<")
        .to(textRef.current, {
            y: -55
        })
        .call(() => {
            setContent(true);
        });

    }, []);

    return (
        <section className="home">
            <h1 ref={textRef}>{text}</h1>

            {content && (
                <div className="nav-container">
                    <NavigationButton
                        title="DASHBOARD"
                        url="/dashboard"
                    />

                    <NavigationButton
                        title={loggedIn ? "LOGOUT" : "LOGIN"}
                        url={loggedIn ? "/logout" : "/login"}
                    />
                </div>
            )}
        </section>
    );
}
