import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ResumeContent } from "@/types/resume";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
    color: "#111827",
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 52,
    paddingRight: 52,
  },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  github: { fontSize: 9, color: "#6b7280", marginBottom: 18 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#6b7280",
    borderBottomWidth: 0.5,
    borderBottomColor: "#d1d5db",
    paddingBottom: 3,
    marginBottom: 6,
  },
  summary: { fontSize: 10 },
  skillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  skillChip: {
    backgroundColor: "#f3f4f6",
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 3,
    fontSize: 9,
    color: "#374151",
  },
  project: { marginBottom: 10 },
  projectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  projectTitle: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  projectPeriod: { fontSize: 9, color: "#6b7280" },
  projectTech: { fontSize: 9, color: "#6b7280", marginBottom: 3 },
  bullet: { flexDirection: "row", marginLeft: 8, marginBottom: 1 },
  bulletDot: { width: 10, fontSize: 10 },
  bulletText: { flex: 1, fontSize: 10 },
  eduRow: { marginBottom: 5 },
  eduDegree: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  eduMeta: { fontSize: 9, color: "#6b7280" },
});

interface ResumePdfProps {
  content: ResumeContent;
  name: string;
  githubUrl?: string;
}

export function ResumePdf({ content, name, githubUrl }: ResumePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{name}</Text>
        {githubUrl && <Text style={styles.github}>{githubUrl}</Text>}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summary}>{content.summary}</Text>
        </View>

        {content.skills.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsRow}>
              {content.skills.map((skill, i) => (
                <Text key={i} style={styles.skillChip}>
                  {skill}
                </Text>
              ))}
            </View>
          </View>
        )}

        {content.experience.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {content.experience.map((exp, i) => (
              <View key={i} style={styles.project}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectTitle}>{exp.project}</Text>
                  {exp.period && <Text style={styles.projectPeriod}>{exp.period}</Text>}
                </View>
                {exp.technologies.length > 0 && (
                  <Text style={styles.projectTech}>{exp.technologies.join(" · ")}</Text>
                )}
                {exp.bullets.map((bullet, j) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {content.education && content.education.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {content.education.map((edu, i) => (
              <View key={i} style={styles.eduRow}>
                <Text style={styles.eduDegree}>{edu.degree}</Text>
                <Text style={styles.eduMeta}>
                  {edu.institution}
                  {edu.year ? ` · ${edu.year}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Page>
    </Document>
  );
}
