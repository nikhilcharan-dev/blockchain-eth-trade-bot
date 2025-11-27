'use client'
import {useRouter} from 'next/navigation'
import MainChart from "@/components/CryptoGraphs/MainChart";
import './styles.css'
import MultiChart from "@/components/CryptoGraphs/MultiChart";

export default function page() {

    return (
        <section className='dashboard'>
            <NavigationBar />
            <MainChart />
            <MultiChart />
            <Footer />
        </section>
    )
}

const NavigationBar = () => {
    const router = useRouter();

    const navigate = (url) => router.push(url);

    return (
        <nav>
            <h3>Nikhil Charan</h3>
            <ul>
                <li>About</li>
                <li>logout</li>
            </ul>
        </nav>
    )
}

const Footer = () => {

    return (
        <footer>
            Crypto Dashboard -Nikhil @2025
        </footer>
    )
}