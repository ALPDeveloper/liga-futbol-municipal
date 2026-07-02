import { SectionHeading } from "./SectionHeading.jsx";

const LAST_UPDATED = "21 de junio de 2026";

const LEGAL_PROFILE = {
  owner: "Ing. Antonio Linares Pulido / ALP DEV",
  brand: "LIGATEC",
  email: "contacto@ligatec.mx",
  phone: "3541073146",
  phoneHref: "tel:+523541073146",
  domain: "www.ligatec.mx",
  domainHref: "https://www.ligatec.mx"
};

const legalSections = [
  {
    id: "privacidad",
    eyebrow: "Privacidad",
    title: "Aviso de privacidad integral",
    body: [
      `${LEGAL_PROFILE.owner}, responsable de la plataforma ${LEGAL_PROFILE.brand}, con correo ${LEGAL_PROFILE.email}, telefono ${LEGAL_PROFILE.phone} y sitio ${LEGAL_PROFILE.domain}, pone a disposicion este aviso de privacidad para explicar como se tratan los datos personales dentro de la plataforma.`,
      `${LEGAL_PROFILE.brand} funciona como plataforma tecnologica para administrar ligas, equipos, jugadores, calendarios, resultados, sanciones, estadisticas, fotografias autorizadas, comunicados y accesos administrativos. La liga contratante y sus administradores autorizados son responsables de que la informacion que capturen sea veraz, licita, pertinente y cuente con las autorizaciones necesarias.`
    ],
    items: [
      "Datos de identificacion y contacto: nombre completo, correo, telefono, rol, equipo, numero de jugador, posicion, cuerpo tecnico, usuario administrativo y datos necesarios para operar la cuenta.",
      "Datos deportivos: equipos, torneos, categorias, jornadas, resultados, goles, tarjetas, sanciones, lesiones publicables, canchas, rankings, estadisticas, bajas, defaults y resoluciones deportivas capturadas por administradores.",
      "Datos de imagen y contenido: fotografias de jugadores, escudos, logotipos, banners, patrocinadores, comunicados y material visual que la liga, el equipo, el jugador o su representante autoricen publicar.",
      "Datos sensibles o de especial cuidado: lesiones, salud, necesidades de apoyo, datos de menores de edad o cualquier informacion que pueda afectar la esfera intima de una persona. Estos datos solo deben capturarse o publicarse con consentimiento expreso y por escrito de la persona titular o de su representante legal.",
      "Datos tecnicos y de seguridad: direccion IP, navegador, dispositivo, fecha y hora de acceso, actividad de sesion, registros de auditoria, intentos de acceso, errores, respaldos y datos necesarios para seguridad, soporte y continuidad del servicio."
    ]
  },
  {
    id: "finalidades",
    eyebrow: "Uso de datos",
    title: "Finalidades del tratamiento",
    body: [
      "Las finalidades principales son operar la liga contratada, autenticar usuarios, publicar informacion deportiva autorizada, generar tablas y estadisticas, mostrar calendarios y resultados, administrar equipos y jugadores, registrar sanciones, publicar comunicados, atender soporte, generar respaldos, prevenir abuso y cumplir obligaciones legales o contractuales.",
      "Como finalidades secundarias, podemos usar informacion agregada o disociada para mejorar la plataforma, medir funcionamiento, preparar reportes internos, comunicar novedades operativas, mostrar espacios de patrocinio autorizados y documentar incidencias del servicio. No vendemos datos personales."
    ],
    items: [
      "La informacion publica de equipos, jugadores, calendario, resultados y estadisticas puede ser visible para aficionados, equipos, patrocinadores, visitantes del sitio y personas con el enlace publico de la liga.",
      "La publicacion de fotografias, datos de menores, lesiones, apoyos medicos, telefonos personales o datos sensibles requiere autorizacion previa, expresa y comprobable.",
      "El titular puede solicitar acceso, rectificacion, cancelacion, oposicion, limitacion de uso, baja de fotografia, retiro de consentimiento o aclaracion por los medios de contacto indicados.",
      "Cuando una autoridad competente solicite informacion o cuando sea necesario proteger derechos de terceros, seguridad, salud, integridad de personas o cumplimiento legal, se podran conservar o comunicar datos en la medida permitida por la ley."
    ]
  },
  {
    id: "terminos",
    eyebrow: "Servicio",
    title: "Terminos y condiciones",
    body: [
      `Al usar ${LEGAL_PROFILE.brand}, aceptas estos terminos. Si administras una liga, declaras que tienes facultades para contratar el servicio, cargar informacion, publicar resultados, usar imagenes, registrar equipos y tratar datos personales relacionados con tu torneo.`,
      "La plataforma organiza informacion deportiva comunitaria. Los datos capturados por administradores pueden contener errores, ajustes de comision, resoluciones pendientes o cambios de calendario; por eso la informacion publicada no sustituye actas, reglamentos internos, acuerdos de asamblea o comunicados oficiales de la liga cuando existan por otros medios."
    ],
    items: [
      "Cuentas: cada usuario administrativo debe proteger sus credenciales, no compartir contrasenas, cerrar sesion en equipos compartidos y responder por la actividad realizada desde su cuenta.",
      "Facultades del administrador: quien capture datos declara que cuenta con permiso de la liga, equipos, jugadores, tutores, patrocinadores o titulares de derechos para publicar la informacion correspondiente.",
      "Contenido: quien sube textos, imagenes, escudos, fotografias, anuncios o comunicados garantiza que no infringe privacidad, imagen, marca, copyright, derechos de menores ni derechos de terceros.",
      "Exactitud: la liga y sus administradores son responsables de revisar resultados, sanciones, estadisticas, fotografias y datos publicados. ALP DEV no decide criterios deportivos ni sustituye a la comision de la liga.",
      "Disponibilidad: haremos esfuerzos razonables para mantener el servicio activo, seguro y respaldado, pero pueden existir mantenimientos, fallas de red, fallas de proveedores, errores de captura, ataques o interrupciones fuera de nuestro control.",
      "Suspension: podemos limitar, suspender o retirar acceso ante falta de pago, uso fraudulento, ataques, extraccion masiva de datos, contenido ilicito, incumplimiento de estos terminos, riesgo para personas o requerimiento de autoridad competente."
    ]
  },
  {
    id: "pagos",
    eyebrow: "Contratacion",
    title: "Politica de pagos, renovaciones y cancelaciones",
    body: [
      `${LEGAL_PROFILE.brand} se contrata directamente con cada liga, salvo pacto distinto por escrito. El costo, forma de pago, vigencia, alcances, descuentos, impuestos y calendario de pago se establecen en la cotizacion, contrato, orden de servicio, mensaje de aceptacion o documento comercial vigente con cada liga contratante.`,
      "El acuerdo comercial de cada liga puede establecer fechas de inicio y fin, numero estimado de equipos, forma de pago, calendario de pagos, cortes, descuentos, cargos por configuracion, impuestos aplicables y alcances incluidos."
    ],
    items: [
      "Equipo registrado: se considera equipo registrado todo equipo dado de alta en la liga, categoria o torneo dentro de la plataforma, aunque tenga jornada de descanso, partido pendiente, baja administrativa posterior o actividad irregular, salvo que el contrato indique otra cosa.",
      "Semana de torneo: se considera semana de servicio cada periodo semanal iniciado durante la vigencia operativa del torneo o desde la activacion de la liga en la plataforma, segun se acuerde en el contrato.",
      "Pago: los pagos deberan cubrirse en la fecha pactada. Si no existe fecha expresa, el pago sera exigible al cierre de cada semana de servicio o al recibir el resumen de cobro correspondiente.",
      "Impuestos y comprobantes: los precios se entenderan en pesos mexicanos. Cualquier impuesto, comision bancaria, cargo de transferencia o requisito de comprobacion fiscal se tratara conforme al acuerdo comercial y la legislacion aplicable.",
      "Atrasos: la falta de pago puede generar recordatorios, restriccion de nuevas capturas, suspension temporal de administradores, ocultamiento parcial de funciones privadas o terminacion del servicio, sin borrar de inmediato datos necesarios para respaldo, aclaracion o cobro.",
      "Cancelacion antes de iniciar: si la liga cancela antes de iniciar configuracion, captura o publicacion, no se cobraran semanas no devengadas. Los trabajos personalizados, configuraciones ya realizadas o gastos expresamente aceptados podran cobrarse.",
      "Cancelacion durante el torneo: la liga puede solicitar cancelacion por escrito. No habra reembolso de semanas ya devengadas, capturas realizadas, configuraciones entregadas o servicios efectivamente prestados. Las semanas futuras no devengadas dejaran de cobrarse desde la fecha efectiva de cancelacion, salvo adeudos, minimos, descuentos condicionados o compromisos expresos del contrato.",
      "Renovacion: cada nuevo torneo requiere confirmacion de renovacion, continuidad o nuevo acuerdo. No se entendera que existe renovacion automatica obligatoria si no hay aceptacion expresa de la liga.",
      "Correcciones de cobro: si hay error en numero de equipos, semanas, categoria o corte, la liga podra pedir aclaracion dentro de los 5 dias naturales siguientes al envio del resumen. Se revisara con base en registros del sistema y acuerdos comerciales."
    ]
  },
  {
    id: "administradores",
    eyebrow: "Responsabilidad",
    title: "Uso por administradores asignados",
    body: [
      "Los administradores asignados por cada liga son usuarios de confianza de la liga contratante. Su acceso permite modificar informacion publica y privada, por lo que deben operar con cuidado, autorizacion y apego al reglamento interno de su competencia.",
      "La liga contratante acepta responder por los actos, omisiones, errores, cargas no autorizadas, publicaciones indebidas, uso incorrecto de imagenes, datos personales sin consentimiento o cambios realizados por sus administradores, auxiliares o personas a quienes les compartan acceso."
    ],
    items: [
      "No compartir cuentas, contrasenas, codigos de recuperacion ni sesiones abiertas con personas no autorizadas.",
      "No capturar datos personales, fotografias, lesiones, sanciones, telefonos o datos de menores sin autorizacion suficiente.",
      "No alterar marcadores, sanciones, defaults o estadisticas con fines fraudulentos, de represalia, discriminacion, apuesta o beneficio indebido.",
      "No descargar, copiar, revender, publicar fuera de contexto o extraer masivamente datos de jugadores, equipos o usuarios.",
      "Notificar de inmediato a ALP DEV cualquier acceso no autorizado, error grave, fuga de datos, perdida de dispositivo, uso indebido de cuenta o solicitud de retiro de informacion.",
      "Mantener indemne a ALP DEV frente a reclamaciones derivadas de informacion capturada sin permiso, errores deportivos internos, imagenes no autorizadas, conflictos entre equipos o incumplimiento de obligaciones de la liga."
    ]
  },
  {
    id: "uso",
    eyebrow: "Conducta",
    title: "Uso aceptable",
    body: [
      `El sitio ${LEGAL_PROFILE.domain} debe utilizarse para fines deportivos, administrativos, informativos y de consulta publica relacionados con ligas, torneos, equipos y jugadores autorizados.`
    ],
    items: [
      "No intentes vulnerar cuentas, automatizar ataques, interferir con servidores, evadir controles, extraer datos masivamente, alterar resultados sin autorizacion o afectar la disponibilidad del servicio.",
      "No publiques datos falsos, discriminatorios, violentos, difamatorios, de acoso, de odio, datos sensibles sin consentimiento o contenido que infrinja derechos de terceros.",
      "No uses marcas, escudos, fotografias, musica, videos, patrocinadores o material protegido si no tienes permiso para publicarlos.",
      "No uses la plataforma para apuestas, fraudes, cobros no autorizados, venta de datos, hostigamiento, suplantacion de identidad o actividades ajenas a la operacion transparente de la liga.",
      "Podemos retirar contenido, bloquear cuentas o suspender ligas cuando exista riesgo legal, tecnico, reputacional, de seguridad, de privacidad o de dano a personas."
    ]
  },
  {
    id: "copyright",
    eyebrow: "Propiedad intelectual",
    title: "Copyright y derechos reservados",
    body: [
      `El software, diseno, estructura, textos propios, componentes visuales, marca ${LEGAL_PROFILE.brand}, logica operativa, flujos de captura y materiales de ALP DEV estan protegidos. Salvo autorizacion por escrito, no se permite copiar, revender, sublicenciar, descompilar, clonar, explotar comercialmente o crear servicios derivados no autorizados de la plataforma.`,
      "Los nombres, escudos, fotografias, banners y materiales de equipos, ligas, patrocinadores o jugadores pertenecen a sus respectivos titulares. Su publicacion dentro del sitio no transfiere propiedad; solo concede una licencia de uso necesaria para operar, respaldar, mostrar y difundir la liga dentro de la plataforma."
    ],
    items: [
      `Derechos Reservados de ${LEGAL_PROFILE.brand}, ALP DEV y/o sus titulares correspondientes.`,
      "Si consideras que un contenido infringe tus derechos, envia una solicitud con identificacion del material, titularidad alegada, datos de contacto, liga relacionada y evidencia razonable.",
      "Podemos retirar contenido mientras se revisa una reclamacion razonable de privacidad, imagen, marca, copyright, datos personales o derechos de menores.",
      "Los administradores que suban materiales protegidos sin autorizacion seran responsables frente a titulares, ligas, equipos, jugadores, patrocinadores y autoridades competentes."
    ]
  },
  {
    id: "menores",
    eyebrow: "Imagen y menores",
    title: "Jugadores menores, fotografias y datos sensibles",
    body: [
      "Cuando una liga incluya menores de edad o informacion delicada, el administrador debe obtener autorizacion de madres, padres, tutores o representantes legales antes de capturar o publicar nombres completos, imagenes, lesiones, sanciones, datos de contacto o cualquier informacion que pueda identificar al menor.",
      "Recomendamos publicar solo la informacion estrictamente necesaria para el torneo y evitar domicilios particulares, documentos oficiales, telefonos personales, CURP, datos medicos detallados, informacion familiar o cualquier dato que exponga innecesariamente a una persona."
    ],
    items: [
      "La solicitud de retiro de imagen o informacion de un menor debe atenderse con prioridad.",
      "Las lesiones o apoyos de salud deben describirse de forma limitada y solo cuando exista autorizacion expresa y por escrito.",
      "El administrador debe conservar evidencias de autorizacion cuando publique fotos, datos sensibles o informacion de menores.",
      "Si una persona titular, tutor o representante solicita retirar una fotografia o dato personal, se revisara la solicitud y, cuando proceda, se ocultara, corregira o eliminara de la vista publica.",
      "ALP DEV podra ocultar preventivamente informacion de menores, fotografias o datos sensibles si detecta riesgo, queja, falta de autorizacion o exposicion innecesaria."
    ]
  },
  {
    id: "limitacion",
    eyebrow: "Alcance",
    title: "Limitacion de responsabilidad",
    body: [
      `${LEGAL_PROFILE.brand} es una herramienta tecnologica para administrar y publicar informacion de ligas. No organiza torneos por cuenta propia, no arbitra partidos, no resuelve controversias deportivas, no valida medicos, no certifica identidad de jugadores y no sustituye decisiones de la liga, comision disciplinaria, arbitros o autoridades.`,
      "En la maxima medida permitida por la ley, ALP DEV no sera responsable por errores de captura de administradores, disputas entre equipos, sanciones internas, uso no autorizado de imagenes por terceros, informacion falsa cargada por usuarios, interrupciones de proveedores, perdida de beneficios, dano indirecto o consecuencias derivadas del uso indebido del sistema."
    ],
    items: [
      "La responsabilidad economica de ALP DEV, cuando legalmente proceda y salvo dolo comprobado, se limitara al monto efectivamente pagado por la liga por el periodo de servicio directamente relacionado con el incidente.",
      "La liga acepta cooperar para corregir datos, retirar contenido, atender reclamaciones de titulares y resolver errores operativos tan pronto como sean detectados.",
      "Nada en estos terminos limita derechos irrenunciables de consumidores, titulares de datos personales o personas protegidas por legislacion aplicable."
    ]
  }
];

export function LegalView({ league, onNavigate, publicLeaguePath = "/" }) {
  const leagueName = league?.name || "la liga publicada";
  const location = league?.city || "Mexico";
  const year = new Date().getFullYear();

  function handleNavigate(event, path) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <main className="page legal-page">
      <section className="hero legal-hero">
        <div className="hero-content">
          <span className="eyebrow">Legal | {location}</span>
          <h1>Terminos, privacidad y uso responsable</h1>
          <p>Marco legal de uso para {LEGAL_PROFILE.brand} y {leagueName}. Ultima actualizacion: {LAST_UPDATED}.</p>
          <div className="hero-actions">
            <a className="primary" href="#privacidad">Ver privacidad</a>
            <a className="secondary" href={publicLeaguePath} onClick={(event) => handleNavigate(event, publicLeaguePath)}>Volver a la liga</a>
          </div>
        </div>
      </section>

      <nav className="legal-index" aria-label="Indice legal">
        {legalSections.map((section) => (
          <a href={`#${section.id}`} key={section.id}>{section.title}</a>
        ))}
        <a href="#contacto">Contacto ARCO</a>
      </nav>

      <section className="legal-callout">
        <strong>Responsable legal y contacto</strong>
        <p>{LEGAL_PROFILE.owner} es el responsable de la plataforma {LEGAL_PROFILE.brand}. Este documento establece las reglas generales de uso, privacidad, pagos, cancelaciones y responsabilidades de administradores. Para contratos con ligas, el documento firmado o aceptado por escrito prevalecera en lo especifico que no contradiga derechos irrenunciables.</p>
      </section>

      <section className="legal-profile-grid" aria-label="Datos del responsable">
        <article>
          <span>Responsable</span>
          <strong>{LEGAL_PROFILE.owner}</strong>
        </article>
        <article>
          <span>Correo</span>
          <a href={`mailto:${LEGAL_PROFILE.email}`}>{LEGAL_PROFILE.email}</a>
        </article>
        <article>
          <span>Telefono</span>
          <a href={LEGAL_PROFILE.phoneHref}>{LEGAL_PROFILE.phone}</a>
        </article>
        <article>
          <span>Sitio</span>
          <a href={LEGAL_PROFILE.domainHref} target="_blank" rel="noreferrer">{LEGAL_PROFILE.domain}</a>
        </article>
      </section>

      <div className="legal-layout">
        <div className="legal-main">
          {legalSections.map((section) => (
            <article className="panel legal-section" id={section.id} key={section.id}>
              <SectionHeading eyebrow={section.eyebrow} title={section.title} />
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}

          <article className="panel legal-section" id="contacto">
            <SectionHeading eyebrow="Derechos ARCO" title="Contacto, solicitudes y cambios" />
            <p>Para acceso, rectificacion, cancelacion, oposicion, limitacion de uso, retiro de consentimiento, baja de fotografia, reporte de vulneracion, aclaracion de cobro o reclamacion de derechos, escribe al correo institucional de {LEGAL_PROFILE.brand}.</p>
            <div className="legal-contact-card">
              <span>Correo legal y privacidad</span>
              <a href={`mailto:${LEGAL_PROFILE.email}`}>{LEGAL_PROFILE.email}</a>
            </div>
            <p>Tu solicitud debe incluir nombre, medio de respuesta, liga relacionada, descripcion clara de lo solicitado y documentos que acrediten identidad o representacion cuando sea necesario. Los cambios a este aviso se publicaran en esta misma pagina.</p>
          </article>
        </div>

        <aside className="legal-side">
          <section className="panel">
            <SectionHeading eyebrow="Resumen" title="Cobertura legal" />
            <ul className="legal-checklist">
              <li>Aviso de privacidad integral</li>
              <li>Datos del responsable</li>
              <li>Terminos de uso</li>
              <li>Pagos y cancelacion</li>
              <li>Administradores asignados</li>
              <li>Copyright</li>
              <li>Menores e imagen</li>
              <li>Derechos ARCO</li>
              <li>Limitacion de responsabilidad</li>
            </ul>
          </section>
          <section className="panel">
            <SectionHeading eyebrow="Pie legal" title="Derechos reservados" />
            <p className="legal-rights">Derechos Reservados &copy; {year} {LEGAL_PROFILE.brand} / ALP DEV. La informacion deportiva pertenece a sus ligas, equipos, jugadores y titulares autorizados.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
