import React, { useState } from "react";
import {
  X,
  Send,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface LiveClaimSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  authToken?: string;
  onClaimCreated: (createdClaimId: string) => void;
}

export const LiveClaimSimulatorModal: React.FC<LiveClaimSimulatorModalProps> = ({
  isOpen,
  onClose,
  backendUrl,
  authToken,
  onClaimCreated,
}) => {
  const generateClaimId = (prefix = "CLM-SIM") => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${rand}`;
  };

  const [claimId, setClaimId] = useState<string>(() => generateClaimId("CLMC"));
  const [patientId, setPatientId] = useState<string>(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
  const [homeRegion, setHomeRegion] = useState<string>("Jawa Barat");
  const [doctorId, setDoctorId] = useState<string>("DOC00042");
  const [sipNumber, setSipNumber] = useState<string>("SIP-503/0042/DKI/2026");
  const [specialty, setSpecialty] = useState<string>("Penyakit Dalam");
  const [facilityId, setFacilityId] = useState<string>("FAC00012");
  const [facilityClass, setFacilityClass] = useState<string>("FKRTL");
  const [icd10Code, setIcd10Code] = useState<string>("I21.9");
  const [icd9Code, setIcd9Code] = useState<string>("36.06");
  const [serviceDate, setServiceDate] = useState<string>("2026-03-15");
  const [serviceTime, setServiceTime] = useState<string>("09:15:00");
  const [tariff, setTariff] = useState<number>(28500000);
  const [lengthOfStay, setLengthOfStay] = useState<number>(5);
  const [fraudScenario, setFraudScenario] = useState<string>("C");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const applyPreset = (preset: "A" | "B" | "C" | "NORMAL") => {
    setErrorMsg(null);
    setSimResult(null);

    if (preset === "C") {
      setClaimId(generateClaimId("CLMC"));
      setPatientId("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
      setHomeRegion("DKI Jakarta");
      setDoctorId("DOC00042");
      setSipNumber("SIP-503/0042/DKI/2026");
      setSpecialty("Kardiologi");
      setFacilityId("FAC00012");
      setFacilityClass("FKRTL");
      setIcd10Code("I21.9");
      setIcd9Code("36.06");
      setServiceDate("2026-03-15");
      setServiceTime("09:15:00");
      setTariff(32500000);
      setLengthOfStay(6);
      setFraudScenario("C");
    } else if (preset === "B") {
      setClaimId(generateClaimId("CLMB"));
      setPatientId("4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a");
      setHomeRegion("Jawa Timur");
      setDoctorId("DOC00018");
      setSipNumber("SIP-440/0018/SBY/2026");
      setSpecialty("Mata");
      setFacilityId("FAC00008");
      setFacilityClass("FKRTL");
      setIcd10Code("H25.9");
      setIcd9Code("13.41");
      setServiceDate("2026-03-15");
      setServiceTime("11:30:00");
      setTariff(14800000);
      setLengthOfStay(1);
      setFraudScenario("B");
    } else if (preset === "A") {
      setClaimId(generateClaimId("CLMA"));
      setPatientId("d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35");
      setHomeRegion("Jawa Tengah");
      setDoctorId("DOC00005");
      setSipNumber("SIP-331/0005/SMG/2026");
      setSpecialty("Bedah Umum");
      setFacilityId("FAC00003");
      setFacilityClass("FKRTL");
      setIcd10Code("K35.8");
      setIcd9Code("47.09");
      setServiceDate("2026-03-15");
      setServiceTime("14:20:00");
      setTariff(19400000);
      setLengthOfStay(4);
      setFraudScenario("A");
    } else {
      setClaimId(generateClaimId("CLM"));
      setPatientId("6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b");
      setHomeRegion("Jawa Barat");
      setDoctorId("DOC00102");
      setSipNumber("SIP-327/0102/BDG/2026");
      setSpecialty("Penyakit Dalam");
      setFacilityId("FAC00025");
      setFacilityClass("FKTP");
      setIcd10Code("J06.9");
      setIcd9Code("-");
      setServiceDate("2026-03-15");
      setServiceTime("10:00:00");
      setTariff(450000);
      setLengthOfStay(0);
      setFraudScenario("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSimResult(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`${backendUrl}/api/claims`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          claim_id: claimId.trim(),
          patient_id: patientId.trim(),
          home_region: homeRegion.trim(),
          doctor_id: doctorId.trim(),
          sip_number: sipNumber.trim(),
          specialty: specialty.trim(),
          facility_id: facilityId.trim(),
          facility_class: facilityClass,
          icd10_code: icd10Code.trim(),
          icd9_code: icd9Code.trim() === "-" ? null : icd9Code.trim(),
          service_date: serviceDate,
          service_time: serviceTime,
          ina_cbgs_tariff: Number(tariff),
          length_of_stay: Number(lengthOfStay),
          fraud_scenario: fraudScenario ? fraudScenario : null,
          is_synthetic: true,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        const detailText = Array.isArray(json.details) ? ` (${json.details.join(" ")})` : "";
        setErrorMsg(`${json.error || "Gagal memproses klaim baru."}${detailText}`);
      } else {
        setSimResult(json);
        onClaimCreated(json.claim_id);
      }
    } catch (err: any) {
      setErrorMsg(
        `Gagal menghubungi API Gateway Backend: ${err?.message || "Koneksi terputus"}.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatIDR = (num: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);

  return (
    <div
      className="animate-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(30, 36, 31, 0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 100,
      }}
    >
      <div
        className="card animate-pop-in"
        style={{
          maxWidth: "820px",
          width: "100%",
          maxHeight: "88vh",
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          borderRadius: "28px",
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
              Simulasi Pengajuan Berkas Klaim (Penyaringan Pra-Pembayaran)
            </h2>
            <small className="muted">
              Uji alur berkas klaim dari faskes mitra &rarr; Skrining cerdas pencegahan fraud &rarr; Pencatatan ke pangkalan data resmi
            </small>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Preset Selector Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "14px",
            padding: "10px 14px",
            borderRadius: "16px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px" }}>
            <Sparkles size={13} className="text-green" />
            PILIHAN SKENARIO PENGUJIAN:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("C")}
            className="button button-secondary"
            style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px", borderRadius: "14px" }}
          >
            Skenario C: Konflik Lokasi &amp; Waktu (Klaim Fiktif)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("B")}
            className="button button-secondary"
            style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px", borderRadius: "14px" }}
          >
            Skenario B: Beban Layanan Ekstrem (Upcoding)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("A")}
            className="button button-secondary"
            style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px", borderRadius: "14px" }}
          >
            Skenario A: Anomali Rujukan Berulang (Doctor Shopping)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("NORMAL")}
            className="button button-secondary"
            style={{ minHeight: "28px", padding: "4px 10px", fontSize: "11px", borderRadius: "14px" }}
          >
            Klaim Wajar &amp; Sesuai Prosedur (Lolos Otomatis)
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: "12px 16px",
              background: "#faecec",
              color: "#a53e3e",
              borderRadius: "14px",
              fontSize: "12px",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <XCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Nomor Berkas Klaim:
                </label>
                <input
                  type="text"
                  required
                  value={claimId}
                  onChange={(e) => setClaimId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Kode Dokter DPJP:
                </label>
                <input
                  type="text"
                  required
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Keahlian / Spesialisasi Medis:
                </label>
                <input
                  type="text"
                  required
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Kode Fasilitas Kesehatan (Faskes):
                </label>
                <input
                  type="text"
                  required
                  value={facilityId}
                  onChange={(e) => setFacilityId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Tingkat Fasilitas Kesehatan:
                </label>
                <select
                  value={facilityClass}
                  onChange={(e) => setFacilityClass(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                >
                  <option value="FKRTL">FKRTL (Rumah Sakit Rujukan)</option>
                  <option value="FKTP">FKTP (Puskesmas / Klinik Pratama)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Diagnosis Utama (Kode ICD-10):
                </label>
                <input
                  type="text"
                  required
                  value={icd10Code}
                  onChange={(e) => setIcd10Code(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px", fontFamily: "monospace" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Tanggal Pelayanan Pasien:
                </label>
                <input
                  type="text"
                  required
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Jam Pelayanan Pasien:
                </label>
                <input
                  type="text"
                  required
                  value={serviceTime}
                  onChange={(e) => setServiceTime(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Besaran Tarif INA-CBG (Rp):
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={tariff}
                  onChange={(e) => setTariff(Number(e.target.value))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Lama Rawat / Hari Rawat (LOS):
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={lengthOfStay}
                  onChange={(e) => setLengthOfStay(Number(e.target.value))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Daerah Asal Peserta:
                </label>
                <input
                  type="text"
                  required
                  value={homeRegion}
                  onChange={(e) => setHomeRegion(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "12px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                  Jenis Skenario Pengujian:
                </label>
                <select
                  value={fraudScenario}
                  onChange={(e) => setFraudScenario(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", background: "#ffffff", fontSize: "12px" }}
                >
                  <option value="">Klaim Wajar (Normal / Tanpa Anomali)</option>
                  <option value="A">Skenario A: Anomali Rujukan Berulang (Doctor Shopping)</option>
                  <option value="B">Skenario B: Beban Pelayanan Dokter Ekstrem (Upcoding)</option>
                  <option value="C">Skenario C: Konflik Lokasi &amp; Waktu (Klaim Fiktif)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>
                ID Peserta (Kode Anonim Terproteksi Salted SHA-256 sesuai UU Pelindungan Data Pribadi):
              </label>
              <input
                type="text"
                required
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "12px", border: "1px solid var(--line)", fontSize: "11.5px", fontFamily: "monospace" }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="button button-primary"
              style={{ width: "100%", marginTop: "4px", borderRadius: "24px", fontSize: "13px" }}
            >
              {submitting ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Memproses Skrining Berkas &amp; Memverifikasi Aturan Pra-Pembayaran...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Kirimkan Berkas ke Penyaringan Pra-Pembayaran
                </>
              )}
            </button>
          </form>

          {/* Live Gate Outcome Result Box */}
          {simResult && (
            <div
              className="card"
              style={{
                marginTop: "16px",
                padding: "16px 20px",
                borderRadius: "18px",
                background: "#f1f8f4",
                border: "1.5px solid var(--green)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, color: "var(--dark-green)", fontSize: "13px" }}>
                  <CheckCircle2 size={18} className="text-green" />
                  Berkas Klaim {simResult.claim_id} Berhasil Diterima &amp; Tercatat Resmi di Pangkalan Data!
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "12px", background: "#ffffff", border: "1px solid var(--line)" }}>
                  {simResult.ai_service_connected ? "Skrining Cerdas Siap & Aktif" : "Menunggu Antrean Skrining"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", fontSize: "12px" }}>
                <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <small className="muted" style={{ display: "block" }}>Indeks Risiko Anomali (FRI)</small>
                  <strong style={{ fontSize: "15px" }}>
                    {simResult.record?.fraud_risk_index !== null
                      ? `FRI ${simResult.record.fraud_risk_index} (${simResult.record.risk_level === "HIGH" ? "Risiko Tinggi" : simResult.record.risk_level === "MEDIUM" ? "Risiko Sedang" : "Risiko Wajar"})`
                      : "Belum Diskrining"}
                  </strong>
                </div>
                <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <small className="muted" style={{ display: "block" }}>Keputusan Penapisan Pra-Pembayaran</small>
                  <strong style={{ fontSize: "13px", color: simResult.record?.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW" ? "#c95353" : "var(--dark-green)" }}>
                    {simResult.record?.pre_payment_gate === "REJECT_FOR_HUMAN_REVIEW" ? "Tahan Sementara (Wajib Telaah Petugas)" : simResult.record?.pre_payment_gate === "AUTO_APPROVE" ? "Persetujuan Otomatis (Lolos Skrining)" : simResult.record?.pre_payment_gate || "Sedang Diproses"}
                  </strong>
                </div>
                <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--line)" }}>
                  <small className="muted" style={{ display: "block" }}>Nilai Klaim Ditahan Sementara</small>
                  <strong style={{ fontSize: "13px" }}>
                    {formatIDR(simResult.record?.ina_cbgs_tariff || tariff)}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "14px",
            paddingTop: "12px",
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button className="button button-secondary" onClick={onClose}>
            Tutup Jendela
          </button>
        </div>
      </div>
    </div>
  );
};

