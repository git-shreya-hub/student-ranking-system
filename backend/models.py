from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class Student(db.Model):
    """Student model for the student_ranking database."""

    __tablename__ = 'students'
    __table_args__ = (
        db.CheckConstraint('marks >= 0 AND marks <= 100', name='ck_students_marks_range'),
        db.CheckConstraint('roll_no > 0', name='ck_students_roll_positive'),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    roll_no = db.Column(db.Integer, unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    marks = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Convert Student object to dictionary."""
        return {
            'id': self.id,
            'roll': self.roll_no,
            'name': self.name,
            'marks': self.marks,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    def __repr__(self):
        return f"<Student {self.roll_no} | {self.name} | {self.marks}>"
